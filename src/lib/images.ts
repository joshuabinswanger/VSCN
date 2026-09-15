import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage, functions } from "./firebase.ts";
import { httpsCallable } from "firebase/functions";
import { hasVerifiedClaim } from "./auth.ts";

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

function imageUploadPath(uid: string, kind: ImageKind, imageId: string): string {
  return `pending/${uid}/${kind}/${imageId}.webp`;
}

/**
 * The ONE record id an unverified account may use, per kind.
 *
 * Neither ruleset can count documents or objects, so the cap on an unverified
 * sign-up is expressed as a namespace of size one: `images/{uid}-{kind}` and
 * the single object it derives, `users/{uid}/{kind}/{uid}-{kind}.webp`. A
 * second upload lands on the same id and overwrites, so replacing a picture
 * works while accumulating pictures does not. Both rulesets spell this name
 * out literally — change it here and you must change it in three places.
 */
export function slotImageId(uid: string, kind: ImageKind): string {
  return `${uid}-${kind}`;
}

export async function blobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

/** The callable allocates the record and permit; another callable validates bytes before publishing. */
export async function uploadImage(
  uid: string,
  kind: ImageKind,
  blob: Blob,
  dims: ImageDimensions,
  onProgress: (pct: number) => void = () => {},
  /**
   * Handed the transfer's cancel function the moment the bytes start moving,
   * so a per-image Cancel button has something to call. uploadBytesResumable
   * has always supported this; until the upload queue arrived nothing asked.
   *
   * Cancelling leaves the images/ record in `uploading`, which is exactly what
   * a tab closed mid-upload leaves — sweepImages finds it by query and clears
   * record and bytes together. So there is nothing to unwind here.
   */
  onCancellable: (cancel: () => void) => void = () => {},
): Promise<UploadedImage> {
  let cancelled = false;
  let cancelTransfer: (() => void) | undefined;
  onCancellable(() => { cancelled = true; cancelTransfer?.(); });
  const checkCancelled = () => {
    if (cancelled) throw Object.assign(new Error("Upload cancelled"), { code: "storage/canceled" });
  };
  checkCancelled();
  // An unverified account has one id per kind and reuses it; a verified one
  // gets a fresh record every time.
  //
  // THE CLAIM, NOT THE RECORD. This read used to be
  // `auth.currentUser?.emailVerified`, which is the cached account record —
  // and the record flips to true on the first page load after verification
  // while the ID TOKEN, the only thing the rulesets can read, keeps saying
  // false until it expires (~1h). In that window the record sent us down this
  // branch's verified side, so we minted a uuid id that neither ruleset would
  // accept from an unverified token, and the create failed with a bare
  // `permission-denied`. Asking for the claim resolves the disagreement (see
  // hasVerifiedClaim) instead of guessing which side of it we are on.
  //
  // Erring towards the slot is still the safe direction: both rulesets accept
  // the slot from a verified member too, deliberately, so a stale `false` here
  // costs a reused slot rather than a failed upload.
  const current = auth.currentUser;
  const usesSlot = current ? !(await hasVerifiedClaim(current)) : true;
  checkCancelled();
  const imageId = usesSlot ? slotImageId(uid, kind) : crypto.randomUUID();
  const storagePath = imageStoragePath(uid, kind, imageId);
  const uploadPath = imageUploadPath(uid, kind, imageId);
  await httpsCallable(functions, "authorizeImageUpload")({ imageId, kind, ...dims });
  checkCancelled();
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, uploadPath), blob, {
      contentType: "image/webp",
      cacheControl: "private, max-age=0",
      // The object knows its owner even when found outside its path.
      customMetadata: { ownerUid: uid, imageId },
    });
    cancelTransfer = () => { task.cancel(); };
    task.on(
      "state_changed",
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve(),
    );
  });

  checkCancelled();
  await httpsCallable(functions, "completeImageUpload")({ imageId });
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

/**
 * Everything a member types about a picture: captions, descriptions and, since
 * 2026-09-07, the link — the record is the ONLY place any of it lives.
 */
export async function updateImageText(
  imageId: string,
  text: {
    caption: string;
    captionDe?: string;
    description?: string;
    descriptionDe?: string;
    link?: string;
    siteLink?: string;
    tags?: string[];
  },
): Promise<void> {
  await updateDoc(doc(db, "images", imageId), {
    caption: text.caption,
    // deleteField() rather than "": the rulesets allow the key to be absent,
    // and an empty string would make every consumer test for emptiness
    // instead of for presence.
    captionDe: text.captionDe ? text.captionDe : deleteField(),
    description: text.description ? text.description : deleteField(),
    descriptionDe: text.descriptionDe ? text.descriptionDe : deleteField(),
    link: text.link ? text.link : deleteField(),
    siteLink: text.siteLink ? text.siteLink : deleteField(),
    tags: text.tags && text.tags.length ? text.tags : deleteField(),
    // THE RETIRED FIELD, SWEPT (2026-09-04 — see GalleryItem.description for
    // why the short description is gone). Unconditional, and the only mention
    // of the name left in the app: records written during its one-day life
    // still carry a value nothing reads, and the alternative to clearing it
    // here is leaving that text in Firestore forever. firestore.rules still
    // permits the key, so this needs no rules deploy and would keep working
    // even if the allowance were dropped, since absence is what it produces.
    descriptionShort: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
