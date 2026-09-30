import { updateProfile, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";
import { uploadAvatar } from "./storage.ts";
import { markImageForDeletion } from "./images.ts";
import { updateUserProfile } from "./firestore.ts";
import { validateBio, validateSocialMedia } from "./validation.ts";
import { saveErrorKind } from "./saveError.ts";
import type { UserDoc } from "./firestore.ts";
import type { GalleryMerge } from "./galleryMerge.ts";

// Every field excluded here is server-written, and firestore.rules pins all of
// them: `email` is a mirror of Auth maintained by syncEmail, and the lifecycle
// trio (`status`, `deletionRequestedAt`, `purgeAfter`) is written only by the
// account-deletion Cloud Functions. They are excluded from the options type
// rather than merely ignored because `{ ...data }` below flows straight into
// updateUser's merge write — one of them arriving from a caller would trip
// serverFieldsUntouched and reject the WHOLE profile save as a bare permission
// error, with nothing naming the field that did it.
export interface ProfileUpdateOptions
  extends Omit<Partial<UserDoc>, "email" | "status" | "deletionRequestedAt" | "purgeAfter"> {
  resizedAvatarBlob?: Blob | null;
  /** The record behind the avatar being replaced; marked pendingDeletion once the save has landed. */
  previousPhotoImageId?: string;
  /** Directory visibility, committed WITH the profile — see ProfileWriteOptions. */
  active?: boolean;
  /** The gallery ids this tab last saw stored — see ProfileWriteOptions. */
  galleryBase?: readonly string[];
}

export async function handleProfileUpdate(
  user: User,
  options: ProfileUpdateOptions,
  onProgress?: (pct: number) => void
): Promise<{ photoURL?: string; photoImageId?: string; gallery?: GalleryMerge }> {
  const {
    resizedAvatarBlob,
    previousPhotoImageId,
    active,
    galleryBase,
    photoURL: passedPhotoURL,
    photoImageId: passedPhotoImageId,
    ...data
  } = options;
  // Deliberately NOT `?? user.photoURL`. Firebase Auth's photoURL is a copy
  // the migration never rewrote, so a Save with no new avatar used to write
  // the legacy (now deleted) object's URL back over the migrated one while
  // photoImageId kept pointing at the new record — the member's avatar
  // vanished from the site, the editor and /admin with nothing logged. When no
  // avatar was uploaded here and the caller passed none, BOTH fields stay out
  // of the merge write and Firestore keeps the values it already holds.
  let photoURL = passedPhotoURL;
  let photoImageId = passedPhotoImageId;

  // 1. Validation (Bio, social links)
  if (data.bio !== undefined) {
    const bioResult = validateBio(data.bio);
    if (!bioResult.ok) {
      throw new Error(bioResult.error);
    }
  }
  if (data.bioDe !== undefined) {
    const bioDeResult = validateBio(data.bioDe, "About you (German)");
    if (!bioDeResult.ok) {
      throw new Error(bioDeResult.error);
    }
  }
  // The social rows are joined into one stored field, so the length that
  // matters is the joined one — and firestore.rules caps it. Checked here so
  // an over-long list fails with a sentence rather than a permission error.
  if (data.socialMedia !== undefined) {
    const socialResult = validateSocialMedia(data.socialMedia);
    if (!socialResult.ok) {
      throw new Error(socialResult.error);
    }
  }

  // 2. Avatar upload — record first, bytes second (images.ts). The URL has
  // to exist before the profile can point at it, so this one write cannot
  // follow the Firestore commit.
  let uploadedAvatarId: string | undefined;
  if (resizedAvatarBlob) {
    const uploaded = await uploadAvatar(user.uid, resizedAvatarBlob, data.photoColor, onProgress);
    photoURL = uploaded.url;
    photoImageId = uploaded.imageId;
    uploadedAvatarId = uploaded.imageId;
  }

  // 3. Firestore FIRST (2026-09-29). Auth's copies of the name and picture
  // used to be written before this commit, so a profile the rules refused —
  // an over-long field, an unverified member's `active` — left Auth
  // disagreeing with Firestore and the editor showing an avatar that was
  // never saved. Now nothing else moves until the source of truth has.
  const profileData: Partial<UserDoc> = {
    ...data,
    ...(photoURL !== undefined ? { photoURL } : {}),
    ...(photoImageId !== undefined ? { photoImageId } : {}),
    updatedAt: new Date(),
  };

  let gallery: GalleryMerge | undefined;
  try {
    gallery = (await updateUserProfile(user.uid, profileData, { active, galleryBase })) ?? undefined;
  } catch (error) {
    // A DEFINITIVE refusal orphans the avatar record just made live: nothing
    // will ever point at it, no sweeper takes a live record, and each retry
    // would add another against MAX_STORED_WORKS. Retire it now. Not on a
    // network failure — a queued write may still land and want it — and not
    // when it IS the previous record (the unverified slot re-uses one id).
    if (uploadedAvatarId && uploadedAvatarId !== previousPhotoImageId && saveErrorKind(error) === "refused") {
      await markImageForDeletion(uploadedAvatarId).catch(() => {});
    }
    throw error;
  }

  // 4. Auth's copies, once Firestore holds the profile.
  if (resizedAvatarBlob && photoURL) {
    await updateProfile(user, { photoURL });
    await user.getIdToken(true);
  }
  if (data.displayName && data.displayName !== user.displayName) {
    await updateProfile(user, { displayName: data.displayName });
  }

  // The replaced avatar's record is marked only after Firestore holds the new
  // one: the source of truth moves first, then the old bytes become sweepable.
  if (resizedAvatarBlob && previousPhotoImageId && previousPhotoImageId !== photoImageId) {
    await markImageForDeletion(previousPhotoImageId).catch(() => {});
  }

  return { photoURL, photoImageId, gallery };
}

/**
 * Asks the `requestRebuild` callable to queue this member's publication. It
 * does not dispatch anything itself: it fingerprints the member's public data
 * and marks the rebuild queue, and `flushMemberRebuilds` dispatches the site
 * workflow from there (functions/src/rebuildQueue.ts). The GitHub token stays
 * server-side. The Firestore triggers on the profile and image records queue
 * the same way, so a failure here does NOT mean the change will not publish —
 * only that this call could not confirm it (publicationStatus.ts then asks
 * getPublicationStatus). Best-effort: false, never a throw.
 */
export async function triggerRebuild() {
  try {
    const requestRebuild = httpsCallable(functions, "requestRebuild");
    await requestRebuild();
    return true;
  } catch (rebuildErr) {
    console.error("Rebuild trigger error:", rebuildErr);
    return false;
  }
}
