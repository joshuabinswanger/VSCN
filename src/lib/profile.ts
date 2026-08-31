import { updateProfile, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";
import { uploadAvatar, deleteAvatar } from "./storage.ts";
import { updateUserProfile } from "./firestore.ts";
import { validateBio, validateSocialMedia } from "./validation.ts";
import type { UserDoc } from "./firestore.ts";

export interface ProfileUpdateOptions extends Partial<UserDoc> {
  resizedAvatarBlob?: Blob | null;
}

export async function handleProfileUpdate(
  user: User,
  options: ProfileUpdateOptions,
  onProgress?: (pct: number) => void
): Promise<{ photoURL: string }> {
  const { resizedAvatarBlob, ...data } = options;
  let photoURL = data.photoURL ?? user.photoURL ?? "";

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

  // 2. Avatar Upload
  let oldPhotoURL = "";
  if (resizedAvatarBlob) {
    oldPhotoURL = user.photoURL ?? "";
    photoURL = await uploadAvatar(user.uid, resizedAvatarBlob, onProgress);

    // Update Firebase Auth profile
    await updateProfile(user, { photoURL });
    // Force refresh token to include new photoURL in claims if needed
    await user.getIdToken(true);
  }

  // 3. Firestore Sync
  // Ensure we have essential fields if they are missing but we are updating the profile
  const profileData: Partial<UserDoc> = {
    ...data,
    photoURL,
    updatedAt: new Date(),
  };

  // If we're updating the name, sync it to Firebase Auth too
  if (data.displayName && data.displayName !== user.displayName) {
    await updateProfile(user, { displayName: data.displayName });
  }

  await updateUserProfile(user.uid, profileData);

  // Best-effort cleanup of the replaced avatar, only after Firestore (the source
  // of truth) holds the new URL. Works for legacy `{uid}.{ext}` names too.
  if (oldPhotoURL && oldPhotoURL !== photoURL) await deleteAvatar(oldPhotoURL);

  return { photoURL };
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
