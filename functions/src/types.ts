import type { Timestamp } from "firebase-admin/firestore";

// Keep in sync with validImage() in firestore.rules and src/lib/images.ts.
export type ImageKind = "avatar" | "gallery";
export type ImageStatus = "uploading" | "live" | "pendingDeletion";
export type ImageOrigin = "member" | "curated";

export interface ImageDoc {
  ownerUid: string;
  kind: ImageKind;
  /** users/{ownerUid}/{kind}/{imageId}.webp — the URL is derived from this, never the reverse. */
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  /** The long text. The member's own portfolio page, and nowhere else. */
  description?: string;
  /** One sentence of the same, for the lightbox and the directory's cards. */
  descriptionShort?: string;
  origin: ImageOrigin;
  provenance?: { source?: string; credit?: string; license?: string; note?: string };
  status: ImageStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DeletionRequester = "member" | "admin" | "auth-delete";

export interface DeletionJob {
  uid: string;
  requestedBy: DeletionRequester;
  requestedAt: Timestamp;
  purgeAfter: Timestamp;
  /** publicProfiles.active before the request, so a cancel restores the truth. */
  activeBefore: boolean;
  /** Images flipped live → pendingDeletion by this request; a cancel flips exactly these back. */
  imageIds: string[];
  steps: {
    imagesDeleted: boolean;
    filesDeleted: boolean;
    docsDeleted: boolean;
    authDeleted: boolean;
  };
  completedAt: Timestamp | null;
  lastError: string | null;
}

export interface EmailMismatch {
  uid: string;
  storedEmail: string | null;
  authEmail: string;
}
