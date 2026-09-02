import { updateProfile, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";
import { uploadAvatar } from "./storage.ts";
import { markImageForDeletion } from "./images.ts";
import { updateUserProfile } from "./firestore.ts";
import { validateBio, validateSocialMedia } from "./validation.ts";
import type { UserDoc } from "./firestore.ts";

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
}

export async function handleProfileUpdate(
  user: User,
  options: ProfileUpdateOptions,
  onProgress?: (pct: number) => void
): Promise<{ photoURL: string; photoImageId?: string }> {
  const { resizedAvatarBlob, previousPhotoImageId, ...data } = options;
  let photoURL = data.photoURL ?? user.photoURL ?? "";
  let photoImageId = data.photoImageId;

  // 1. Validation (Bio, social links)
  if (data.bio !== undefined) {
    const bioResult = validateBio(data.bio);
    if (!bioResult.ok) {
      throw new Error(bioResult.error);
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

  // 2. Avatar upload — record first, bytes second (images.ts).
  if (resizedAvatarBlob) {
    const uploaded = await uploadAvatar(user.uid, resizedAvatarBlob, data.photoColor, onProgress);
    photoURL = uploaded.url;
    photoImageId = uploaded.imageId;
    await updateProfile(user, { photoURL });
    await user.getIdToken(true);
  }

  // 3. Firestore sync
  const profileData: Partial<UserDoc> = {
    ...data,
    photoURL,
    ...(photoImageId ? { photoImageId } : {}),
    updatedAt: new Date(),
  };

  if (data.displayName && data.displayName !== user.displayName) {
    await updateProfile(user, { displayName: data.displayName });
  }

  await updateUserProfile(user.uid, profileData);

  // The replaced avatar's record is marked only after Firestore holds the new
  // one: the source of truth moves first, then the old bytes become sweepable.
  if (resizedAvatarBlob && previousPhotoImageId && previousPhotoImageId !== photoImageId) {
    await markImageForDeletion(previousPhotoImageId).catch(() => {});
  }

  return { photoURL, photoImageId };
}

/**
 * Triggers a GitHub Actions rebuild for the community page via the
 * `requestRebuild` Cloud Function, which verifies the caller's Firebase Auth
 * token and holds the GitHub token as a server-side secret.
 * Best-effort: failures are logged, never thrown.
 */
export async function triggerRebuild() {
  try {
    const requestRebuild = httpsCallable(functions, "requestRebuild");
    await requestRebuild();
  } catch (rebuildErr) {
    console.error("Rebuild trigger error:", rebuildErr);
  }
}
