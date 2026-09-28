import type { Timestamp } from "firebase-admin/firestore";

// Keep in sync with validImage() in firestore.rules, src/lib/images.ts, and
// src/lib/galleryRecords.ts.
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
  /** Where the image appeared, scheme-less (2026-09-07: moved here from the gallery array). ≤ 200. */
  link?: string;
  /** The member's own project page for this piece, scheme-less (2026-09-10). ≤ 200. Distinct from `link`: where it appeared vs where it lives on their site. */
  siteLink?: string;
  /** What is in the picture, ≤ 5 (2026-09-08). No function reads this — mirrored for hasOnly parity only. */
  tags?: string[];
  /** The member's project this work is in (2026-09-23). Carried over by a replacement; nothing else server-side reads it. */
  projectId?: string;
  origin: ImageOrigin;
  /**
   * What the work IS (2026-09-23, documentation/20260923-motion-works-design.md).
   * Absent means "still", so every record written before it is valid unchanged.
   * The WebP at storagePath is the poster of a video work — anything that knows
   * only stills keeps working by showing it. Server-written: rules let a client
   * keep these three on a caption save and never change them.
   */
  media?: "still" | "loop" | "embed";
  /** The video an embed plays. The id, never the URL — the player URL is always rebuilt from it. */
  embed?: { provider: "youtube" | "vimeo"; videoId: string; hash?: string };
  /** Whose poster sits at storagePath; the platform's is kept at `{id}.auto.webp` either way. */
  posterSource?: "auto" | "member";
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
  state?: "scheduled" | "purging" | "completed";
  leaseOwner?: string;
  leaseUntil?: Timestamp;
}

export interface EmailMismatch {
  uid: string;
  storedEmail: string | null;
  authEmail: string;
}
